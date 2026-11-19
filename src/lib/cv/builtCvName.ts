/**
 * The CV builder names the file it stores "{name} - Mployedin CV.pdf"
 * (job-seeker/cv/built-cv.ts). An application is sent with a copy of that name,
 * and it keeps the file after the seeker's stored built copy has been replaced
 * by a newer one, so the name is how a sent built CV is still known.
 *
 * Client-safe (no imports): shared by the server's originalCvSource and the
 * browser's candidateCv.
 */
export const BUILT_CV_NAME = / - Mployedin CV\.pdf$/i;
