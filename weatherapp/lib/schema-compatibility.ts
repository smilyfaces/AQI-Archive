type DbSchemaError = { code?: string; message?: string } | null | undefined;

const optionalCityAnalysisColumn = /(?:cities\.)?(?:region|climate_type|population|size_band)/i;

export function isMissingOptionalCityAnalysisColumn(error: DbSchemaError): boolean {
  if (!error) return false;
  if (error.code === "PGRST204") return true;
  const message = error.message ?? "";
  return optionalCityAnalysisColumn.test(message)
    && (error.code === "42703" || /column .* does not exist|schema cache/i.test(message));
}
