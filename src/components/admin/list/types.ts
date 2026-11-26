import type { ComponentType } from "react";
import type { ZodType, ZodTypeDef } from "zod";
import type { Collection } from "@/lib/admin/queries";
import type { AnyForm } from "../form/FormField";

export type Row = { id: number; isVisible: boolean; sortOrder: number };

export type CollectionConfig<T extends Row, I> = {
  collection: Collection;
  title: string;
  singular: string;
  /** The *Input schema. */
  schema: ZodType<I, ZodTypeDef, unknown>;
  /** Every field path with an input; server errors outside this list show at form level. */
  knownFields: readonly string[];
  toInput(item: T): I;
  emptyInput(nextSortOrder: number): I;
  /** A hidden copy with a unique name/slug. */
  duplicateInput(item: T, all: T[], nextSortOrder: number): I;
  rowTitle(item: T): string;
  rowSubtitle(item: T): string | null;
  /** Field that shows the 409 message ("slug" for projects). */
  conflictField?: string;
  FormBody: ComponentType<{ form: AnyForm; item: T | null }>;
};
