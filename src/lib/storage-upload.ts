import { ref, uploadBytesResumable, getDownloadURL, type UploadMetadata } from "firebase/storage";
import { storage } from "@/lib/firebase";

const NOT_CONFIGURED_MESSAGE = "Firebase isn't configured yet. Add your project's credentials to .env (see .env.example).";

/** Uploads `file` under storage/{...pathSegments}/{timestamp-sanitizedFileName} and resolves its public download URL. */
export function uploadFileToStorage(
  pathSegments: string[],
  file: File,
  options?: { metadata?: UploadMetadata; onProgress?: (pct: number) => void },
): Promise<string> {
  if (!storage) return Promise.reject(new Error(NOT_CONFIGURED_MESSAGE));
  const safeName = `${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
  const storageRef = ref(storage, [...pathSegments, safeName].join("/"));
  const task = uploadBytesResumable(storageRef, file, options?.metadata);

  return new Promise((resolve, reject) => {
    task.on(
      "state_changed",
      (snapshot) => {
        if (options?.onProgress) {
          options.onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
        }
      },
      reject,
      async () => {
        try {
          resolve(await getDownloadURL(task.snapshot.ref));
        } catch (err) {
          reject(err);
        }
      },
    );
  });
}
