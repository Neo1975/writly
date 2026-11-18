import { isMapImagePath, MAP_IMAGE_TYPES, type MapImageExt } from "@/lib/project/world";
import { readBinary } from "@/lib/server/github";
import { ApiError, assertRepoRef, withGitHub } from "@/lib/server/http";

type Ctx = { params: Promise<{ owner: string; repo: string }> };

/**
 * Immagine di una mappa dal repository (privato) del progetto. Solo PNG, JPEG e
 * WebP sotto mondo/mappe/, servite con tipo fisso e senza possibilità di esecuzione.
 */
export async function GET(req: Request, { params }: Ctx) {
  const { owner, repo } = await params;
  return withGitHub(req, async (gh) => {
    assertRepoRef(owner, repo);
    const path = new URL(req.url).searchParams.get("path") ?? "";
    if (!isMapImagePath(path)) throw new ApiError(400, "Percorso non consentito.");
    const bytes = await readBinary(gh, owner, repo, path);
    if (!bytes) throw new ApiError(404, "Immagine non trovata.");
    const ext = path.slice(path.lastIndexOf(".") + 1) as MapImageExt;
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": MAP_IMAGE_TYPES[ext],
        "Cache-Control": "private, max-age=300",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
