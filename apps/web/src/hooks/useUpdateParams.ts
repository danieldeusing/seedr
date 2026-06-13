import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

export function useUpdateParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const newParams = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") {
          newParams.delete(key);
        } else {
          newParams.set(key, value);
        }
      }
      setSearchParams(newParams, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  return { searchParams, setSearchParams, updateParams };
}
