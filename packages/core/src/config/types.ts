import { z } from "zod";

export const InputFormatSchema = z.enum(["csv", "json", "parquet"]);
export type InputFormat = z.infer<typeof InputFormatSchema>;

export const InputConfigSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, {
      message:
        "Input table name must be a valid SQL identifier (alphanumeric and underscore)",
    }),
  source: z.string().min(1),
  format: InputFormatSchema.default("csv"),
});
export type InputConfig = z.infer<typeof InputConfigSchema>;

export const TransformationConfigSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, {
      message: "Transformation table name must be a valid SQL identifier",
    }),
  sql: z.string().min(1),
});
export type TransformationConfig = z.infer<typeof TransformationConfigSchema>;

export const ColumnSchemaCheck = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  nullable: z.boolean().optional(),
});
export type ColumnSchema = z.infer<typeof ColumnSchemaCheck>;

export const SchemaCheckSchema = z.object({
  type: z.literal("schema"),
  name: z.string().optional(),
  target: z.string().optional(),
  expect: z.object({
    columns: z.array(ColumnSchemaCheck).min(1),
  }),
});
export type SchemaCheckConfig = z.infer<typeof SchemaCheckSchema>;

export const NotNullCheckSchema = z.object({
  type: z.literal("not_null"),
  name: z.string().optional(),
  target: z.string().optional(),
  columns: z.array(z.string().min(1)).min(1),
});
export type NotNullCheckConfig = z.infer<typeof NotNullCheckSchema>;

export const UniqueCheckSchema = z.object({
  type: z.literal("unique"),
  name: z.string().optional(),
  target: z.string().optional(),
  columns: z.array(z.string().min(1)).min(1),
});
export type UniqueCheckConfig = z.infer<typeof UniqueCheckSchema>;

export const CustomSqlCheckSchema = z.object({
  type: z.literal("custom_sql"),
  name: z.string().min(1),
  sql: z.string().min(1),
  expect: z.enum(["zero_rows", "has_rows"]).default("zero_rows"),
});
export type CustomSqlCheckConfig = z.infer<typeof CustomSqlCheckSchema>;

export const RowCountCheckSchema = z
  .object({
    type: z.literal("row_count"),
    name: z.string().optional(),
    target: z.string().optional(),
    min: z
      .number()
      .int({ message: "min must be an integer" })
      .nonnegative({ message: "min cannot be negative" })
      .optional(),
    max: z
      .number()
      .int({ message: "max must be an integer" })
      .nonnegative({ message: "max cannot be negative" })
      .optional(),
  })
  .refine((data) => data.min !== undefined || data.max !== undefined, {
    message:
      "At least one of 'min' or 'max' must be specified for row_count check",
  })
  .refine(
    (data) => {
      if (data.min !== undefined && data.max !== undefined) {
        return data.min <= data.max;
      }
      return true;
    },
    {
      message: "'min' must be less than or equal to 'max' for row_count check",
    },
  );
export type RowCountCheckConfig = z.infer<typeof RowCountCheckSchema>;

export const OutputMatchCheckSchema = z.object({
  type: z.literal("output_match"),
  name: z.string().optional(),
  target: z.string().optional(),
  expected: z.string().min(1, { message: "expected fixture path is required" }),
  ordered: z.boolean().optional(),
  compare: z.array(z.string().min(1)).optional(),
});
export type OutputMatchCheckConfig = z.infer<typeof OutputMatchCheckSchema>;

export const CheckConfigSchema = z.union([
  SchemaCheckSchema,
  NotNullCheckSchema,
  UniqueCheckSchema,
  CustomSqlCheckSchema,
  RowCountCheckSchema,
  OutputMatchCheckSchema,
]);
export type CheckConfig = z.infer<typeof CheckConfigSchema>;

export const PipeSealConfigSchema = z.object({
  version: z.string().default("1"),
  name: z.string().min(1),
  inputs: z.array(InputConfigSchema).min(1),
  transformations: z.array(TransformationConfigSchema).min(1),
  checks: z.array(CheckConfigSchema).min(1),
});
export type PipeSealConfig = z.infer<typeof PipeSealConfigSchema>;
