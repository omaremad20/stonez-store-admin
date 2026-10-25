"use client";

import { useEffect, useRef, useState } from "react";
import { useForm, useWatch, type FieldErrors as RHFFieldErrors, type Resolver } from "react-hook-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useGuardedNavigation, useUnsavedChangesGuard } from "@/components/dashboard/navigation-guard";
import { ENTITY_CONFIG, type EntityKey } from "@/lib/entities/config";
import { EntityRequestError, toEntityError } from "@/lib/entities/errors";
import {
  checkNameAvailable,
  createEntityRequest,
  discardUploadedImage,
  fetchEntityRecord,
  ImagePreparationError,
  updateEntityRequest,
  uploadEntityImage,
} from "@/lib/entities/form-client";
import {
  ENTITY_FORM_RULES,
  formSchemaFor,
  type EntityFormField,
  type EntityFormValues,
  type EntityPayloadInput,
  type EntityRecord,
  type ImageAction,
} from "@/lib/entities/form-schema";
import { entityKeys, invalidateEntityQueries } from "@/lib/entities/hooks";

export type FormMode = { kind: "create" } | { kind: "edit"; record: EntityRecord };

/** Problems that can't be attached to a single field. */
export type FormNotice =
  | { kind: "error"; message: string }
  | { kind: "uncertain"; message: string }
  | { kind: "stale" }
  | { kind: "gone"; message: string }
  | { kind: "forbidden"; message: string };

export type FormPhase = "idle" | "uploading" | "saving" | "verifying";

const FIELD_ORDER: EntityFormField[] = ["name", "departmentId", "description", "image"];

export function toFormValues(record: EntityRecord | null): EntityFormValues {
  return {
    name: record?.name ?? "",
    description: record?.description ?? "",
    isActive: record?.isActive ?? true,
    departmentId: record?.departmentId ?? "",
    image: record?.imageUrl ? { kind: "existing", url: record.imageUrl } : { kind: "none" },
  };
}

/** Minimal Zod → React Hook Form resolver (avoids an extra dependency). */
function zodResolver(entity: EntityKey): Resolver<EntityFormValues> {
  const schema = formSchemaFor(entity);
  return async (values) => {
    const result = schema.safeParse(values);
    if (result.success) return { values, errors: {} };
    const errors: RHFFieldErrors<EntityFormValues> = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0] as keyof EntityFormValues;
      if (!errors[key]) errors[key] = { type: issue.code, message: issue.message };
    }
    return { values: {}, errors };
  };
}

/** Same-name check for tables with a unique name index, debounced and cached. */
function useNameAvailability(entity: EntityKey, name: string, originalName: string | null, excludeId: string | null) {
  const rules = ENTITY_FORM_RULES[entity];
  const trimmed = name.trim();
  const [debounced, setDebounced] = useState(trimmed);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(trimmed), 450);
    return () => window.clearTimeout(timer);
  }, [trimmed]);

  const unchanged = originalName !== null && debounced.toLowerCase() === originalName.trim().toLowerCase();
  const enabled = rules.uniqueName && debounced.length >= 2 && debounced.length <= rules.nameMax && !unchanged;

  const query = useQuery({
    queryKey: [...entityKeys.entity(entity), "name-check", debounced.toLowerCase(), excludeId],
    queryFn: ({ signal }) => checkNameAvailable(entity, debounced, excludeId, signal),
    enabled,
    staleTime: 15_000,
    retry: false,
  });

  const settled = debounced === trimmed;
  return {
    enabled: rules.uniqueName && !unchanged && trimmed.length >= 2,
    checking: enabled && (!settled || query.isFetching),
    taken: settled && enabled && query.data?.available === false,
    available: settled && enabled && query.data?.available === true,
    checkedName: debounced,
  };
}

export function useEntityForm({ entity, mode, returnTo }: { entity: EntityKey; mode: FormMode; returnTo: string }) {
  const config = ENTITY_CONFIG[entity];
  const rules = ENTITY_FORM_RULES[entity];
  const singular = config.singular.toLowerCase();
  const queryClient = useQueryClient();
  const { navigate, release } = useGuardedNavigation();

  // The record the form was initialised from (updated after "load latest").
  const [baseline, setBaseline] = useState<EntityRecord | null>(mode.kind === "edit" ? mode.record : null);
  const form = useForm<EntityFormValues>({
    defaultValues: toFormValues(baseline),
    resolver: zodResolver(entity),
    mode: "onTouched",
    reValidateMode: "onChange",
    shouldFocusError: true,
  });

  const [phase, setPhase] = useState<FormPhase>("idle");
  const [notice, setNotice] = useState<FormNotice | null>(null);

  // Stable across retries: lets an uncertain create be verified (categories)
  // and re-uses an already uploaded image instead of uploading it twice.
  const clientIdRef = useRef<string>("");
  const uploadRef = useRef<{ file: File; path: string } | null>(null);
  // Outcome of the last write is unknown (timeout). State drives the UI; the ref
  // mirrors it for the async submit flow.
  const [uncertain, setUncertainState] = useState(false);
  const uncertainRef = useRef(false);
  const setUncertain = (value: boolean) => {
    uncertainRef.current = value;
    setUncertainState(value);
  };
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!clientIdRef.current) clientIdRef.current = crypto.randomUUID();
  }, []);

  const isDirty = form.formState.isDirty;
  const busy = phase !== "idle";
  const nameValue = useWatch({ control: form.control, name: "name" });
  const nameCheck = useNameAvailability(entity, nameValue, baseline?.name ?? null, baseline?.id ?? null);

  useUnsavedChangesGuard({
    when: isDirty || busy || uncertain,
    // "Discard changes" really discards: Next keeps visited pages alive (React
    // Activity), so without a reset the draft would reappear on Back.
    onDiscard: () => resetToBaseline(),
    message: () =>
      submittingRef.current
        ? {
            title: "Leave while saving?",
            description: "Your changes are still being saved. If you leave now, you won't see whether saving succeeded.",
          }
        : {
            title: "Discard unsaved changes?",
            description: `This ${singular} has changes that haven't been saved. If you leave now, they will be lost.`,
          },
  });

  // Remove an uploaded image that never got attached (user left after a failed
  // save). Also runs when Activity hides the page, so forget the reference: a
  // later save from the restored page uploads the file again.
  useEffect(() => {
    return () => {
      const upload = uploadRef.current;
      if (upload && !uncertainRef.current) {
        uploadRef.current = null;
        void discardUploadedImage(entity, upload.path);
      }
    };
  }, [entity]);

  /** Back to a clean form: the loaded record (edit) or empty fields (create). */
  function resetToBaseline(nextBaseline: EntityRecord | null = baseline) {
    if (uploadRef.current && !uncertainRef.current) void discardUploadedImage(entity, uploadRef.current.path);
    uploadRef.current = null;
    if (mode.kind === "create") clientIdRef.current = crypto.randomUUID();
    setUncertain(false);
    setNotice(null);
    form.reset(toFormValues(nextBaseline));
  }

  /* ------------------------------------------------------------ helpers */

  function applyFieldErrors(fieldErrors: NonNullable<EntityRequestError["fieldErrors"]>) {
    const first = FIELD_ORDER.find((field) => fieldErrors[field]);
    for (const field of FIELD_ORDER) {
      const message = fieldErrors[field];
      if (message) form.setError(field, { type: "server", message });
    }
    if (first && first !== "image") form.setFocus(first);
  }

  function finishSuccess(record: EntityRecord, options: { imageCleanupFailed?: boolean } = {}) {
    uploadRef.current = null; // now referenced by the saved row
    release(); // the redirect below must not trigger the unsaved-changes dialog
    // Clean baseline so the (Activity-preserved) page is fresh if revisited:
    // an empty form after create, the saved record (and its new token) after edit.
    if (mode.kind === "edit") {
      setBaseline(record);
      resetToBaseline(record);
    } else {
      resetToBaseline(null);
    }
    invalidateEntityQueries(queryClient, entity);
    toast.success(mode.kind === "create" ? `“${record.name}” was created.` : `Changes to “${record.name}” were saved.`, {
      description: options.imageCleanupFailed ? "The previous image couldn't be removed from storage; it will be cleaned up later." : undefined,
    });
    navigate(returnTo);
  }

  function buildPayload(values: EntityFormValues, image: ImageAction, force?: boolean): EntityPayloadInput {
    const base = {
      name: values.name.trim(),
      description: values.description.trim(),
      isActive: values.isActive,
      image,
      ...(rules.hasDepartment ? { departmentId: values.departmentId || null } : {}),
    };
    if (mode.kind === "create") return { ...base, clientId: clientIdRef.current };
    return { ...base, expectedUpdatedAt: baseline!.updatedAt, ...(force ? { force: true } : {}) };
  }

  /** After a timeout, find out whether the create actually happened. */
  async function verifyCreate(values: EntityFormValues): Promise<"created" | "absent" | "unknown"> {
    try {
      if (rules.uniqueName) {
        const result = await checkNameAvailable(entity, values.name.trim(), null);
        if (!result.available && result.existingId) {
          const record = await fetchEntityRecord(entity, result.existingId);
          finishSuccess(record);
          return "created";
        }
        return "absent";
      }
      const record = await fetchEntityRecord(entity, clientIdRef.current);
      finishSuccess(record);
      return "created";
    } catch (error) {
      if (error instanceof EntityRequestError && error.code === "not_found") return "absent";
      return "unknown";
    }
  }

  /** After a timeout, compare the stored record with what was sent. */
  async function verifyUpdate(values: EntityFormValues): Promise<"applied" | "not-applied" | "stale" | "unknown"> {
    try {
      const record = await fetchEntityRecord(entity, baseline!.id);
      if (record.updatedAt === baseline!.updatedAt) return "not-applied";
      const matches =
        record.name === values.name.trim() &&
        (record.description ?? "") === values.description.trim() &&
        record.isActive === values.isActive &&
        (!rules.hasDepartment || (record.departmentId ?? "") === values.departmentId) &&
        (values.image.kind === "existing" ||
          (values.image.kind === "none" ? record.storagePath === null : record.storagePath === uploadRef.current?.path));
      if (matches) {
        finishSuccess(record);
        return "applied";
      }
      return "stale";
    } catch (error) {
      if (error instanceof EntityRequestError && error.code === "not_found") {
        setNotice({ kind: "gone", message: `This ${singular} was deleted while you were editing it.` });
        return "unknown";
      }
      return "unknown";
    }
  }

  /* ------------------------------------------------------------- submit */

  async function save(values: EntityFormValues, options: { force?: boolean } = {}) {
    if (submittingRef.current) return; // duplicate submissions
    submittingRef.current = true;
    setNotice(null);

    try {
      // Skipped after an uncertain create: the "taken" name may be our own
      // committed row, which the verification below must recognise first.
      if (!uncertainRef.current && nameCheck.taken && nameCheck.checkedName === values.name.trim()) {
        form.setError("name", { type: "server", message: `“${values.name.trim()}” is already used by another ${singular}.` });
        form.setFocus("name");
        return;
      }

      // A previous attempt timed out: never resubmit blindly.
      if (uncertainRef.current) {
        setPhase("verifying");
        if (mode.kind === "create") {
          const outcome = await verifyCreate(values);
          if (outcome === "created") return;
          if (outcome === "unknown") {
            setNotice({ kind: "uncertain", message: `We still can't confirm whether “${values.name.trim()}” was created. Check your connection, then try again.` });
            return;
          }
        } else {
          const outcome = await verifyUpdate(values);
          if (outcome === "applied") return;
          if (outcome === "stale") {
            setNotice({ kind: "stale" });
            setUncertain(false);
            return;
          }
          if (outcome === "unknown") {
            setNotice((current) => current ?? { kind: "uncertain", message: "We still can't confirm whether your changes were saved. Check your connection, then try again." });
            return;
          }
        }
        setUncertain(false);
      }

      // 1. Image (uploaded only now, and only once per selected file).
      let image: ImageAction = { action: "keep" };
      if (values.image.kind === "new") {
        if (uploadRef.current?.file !== values.image.file) {
          if (uploadRef.current) void discardUploadedImage(entity, uploadRef.current.path);
          uploadRef.current = null;
          setPhase("uploading");
          try {
            const path = await uploadEntityImage(entity, values.image.file);
            uploadRef.current = { file: values.image.file, path };
          } catch (error) {
            if (error instanceof ImagePreparationError) {
              form.setError("image", { type: "server", message: error.message });
              return;
            }
            const failure = toEntityError(error);
            if (failure.code === "forbidden") setNotice({ kind: "forbidden", message: failure.message });
            else form.setError("image", { type: "server", message: failure.message });
            return;
          }
        }
        image = { action: "set", path: uploadRef.current!.path };
      } else if (mode.kind === "edit" && values.image.kind === "none" && baseline?.imageUrl) {
        image = { action: "remove" };
      }

      // 2. Write.
      setPhase("saving");
      const payload = buildPayload(values, image, options.force);
      if (mode.kind === "create") {
        const { record } = await createEntityRequest(entity, payload);
        finishSuccess(record);
      } else {
        const { record, imageCleanupFailed } = await updateEntityRequest(entity, baseline!.id, payload);
        finishSuccess(record, { imageCleanupFailed });
      }
    } catch (error) {
      handleWriteError(toEntityError(error), values);
    } finally {
      submittingRef.current = false;
      setPhase("idle");
    }
  }

  function handleWriteError(error: EntityRequestError, values: EntityFormValues) {
    if (error.isUncertain) {
      // The request may have committed: keep the uploaded image and require a check first.
      setUncertain(true);
      setNotice({
        kind: "uncertain",
        message:
          mode.kind === "create"
            ? `We couldn't confirm whether “${values.name.trim()}” was created. Use “Check & retry” — we'll check first, so it can't be created twice.`
            : "We couldn't confirm whether your changes were saved. Use “Check & retry” — we'll check the saved version first.",
      });
      return;
    }

    // Definitely not saved: an image uploaded for this attempt can be re-used on retry
    // unless the image itself was the problem.
    if (error.fieldErrors?.image && uploadRef.current) {
      void discardUploadedImage(entity, uploadRef.current.path);
      uploadRef.current = null;
    }

    if (error.fieldErrors && Object.keys(error.fieldErrors).length > 0) {
      applyFieldErrors(error.fieldErrors);
      return;
    }
    switch (error.code) {
      case "stale":
        setNotice({ kind: "stale" });
        return;
      case "not_found":
        setNotice({ kind: "gone", message: error.message });
        return;
      case "forbidden":
      case "unauthenticated":
        setNotice({ kind: "forbidden", message: error.message });
        return;
      default:
        setNotice({ kind: "error", message: error.message });
    }
  }

  /** Stale record: replace the form with the latest saved version. */
  async function loadLatest() {
    if (!baseline) return;
    setPhase("verifying");
    try {
      const latest = await fetchEntityRecord(entity, baseline.id);
      setBaseline(latest);
      form.reset(toFormValues(latest));
      queryClient.setQueryData(entityKeys.record(entity, latest.id), latest);
      setNotice(null);
      toast.message("Loaded the latest saved version.");
    } catch (error) {
      const failure = toEntityError(error);
      setNotice(failure.code === "not_found" ? { kind: "gone", message: failure.message } : { kind: "error", message: failure.message });
    } finally {
      setPhase("idle");
    }
  }

  return {
    form,
    config,
    rules,
    mode,
    baseline,
    phase,
    busy,
    isDirty,
    notice,
    uncertain,
    nameCheck,
    // handleSubmit is created at event time (not during render) because the
    // submit flow reads refs.
    submit: (event?: React.BaseSyntheticEvent) => form.handleSubmit((values) => save(values))(event),
    overwrite: () => form.handleSubmit((values) => save(values, { force: true }))(),
    loadLatest,
    dismissNotice: () => setNotice(null),
  };
}

export type EntityFormController = ReturnType<typeof useEntityForm>;
