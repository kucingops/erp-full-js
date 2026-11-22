import { Transform } from 'class-transformer';

/**
 * Query string selalu berupa string ("true"/"false"), jadi perlu diubah ke boolean
 * sebelum divalidasi @IsBoolean(). Nilai lain dibiarkan supaya validasi menolaknya.
 */
export const ToBoolean = () =>
  Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  );
