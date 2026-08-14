/**
 * Kiểu kết quả chuẩn cho tầng service:
 * - success: true  → có data
 * - success: false → có error message
 */
export type Result<T> = { success: true; data: T } | { success: false; error: string };
