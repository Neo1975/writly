import { RequestError } from "octokit";
import { VARIANT_PREFIX, isVariantRef, variantName } from "@/lib/project/paths";
import { slugify } from "@/lib/project/slug";
import { ApiError } from "./errors";
import type { GitHub } from "./github";

/**
 * Varianti: rami Git «variante/<nome>» del repository del progetto. Si scrive
 * su una variante come sulla versione principale; poi la si unisce (merge Git)
 * o se ne porta un capitolo alla volta nella principale.
 */

export interface Variant {
  ramo: string;
  nome: string;
  sha: string;
}

export async function listVariants(gh: GitHub, owner: string, repo: string): Promise<{ principale: string; varianti: Variant[] }> {
  const { data: info } = await gh.rest.repos.get({ owner, repo });
  let refs: { ref: string; object: { sha: string } }[] = [];
  try {
    const { data } = await gh.rest.git.listMatchingRefs({ owner, repo, ref: `heads/${VARIANT_PREFIX}` });
    refs = data;
  } catch (err) {
    if (!(err instanceof RequestError && (err.status === 404 || err.status === 409))) throw err;
  }
  const varianti = refs
    .map((r) => ({ ramo: r.ref.replace(/^refs\/heads\//, ""), sha: r.object.sha }))
    .filter((r) => isVariantRef(r.ramo))
    .map((r) => ({ ...r, nome: variantName(r.ramo) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "it"));
  return { principale: info.default_branch, varianti };
}

/** Crea una variante dallo stato attuale della versione principale. */
export async function createVariant(gh: GitHub, owner: string, repo: string, nome: string): Promise<Variant> {
  const ramo = `${VARIANT_PREFIX}${slugify(nome, 60)}`;
  if (!isVariantRef(ramo)) throw new ApiError(400, "Nome della variante non valido.");
  const { data: info } = await gh.rest.repos.get({ owner, repo });
  const { data: head } = await gh.rest.git.getRef({ owner, repo, ref: `heads/${info.default_branch}` });
  try {
    await gh.rest.git.createRef({ owner, repo, ref: `refs/heads/${ramo}`, sha: head.object.sha });
  } catch (err) {
    if (err instanceof RequestError && err.status === 422) throw new ApiError(409, `Esiste già una variante «${variantName(ramo)}».`);
    throw err;
  }
  return { ramo, nome: variantName(ramo), sha: head.object.sha };
}

export async function deleteVariant(gh: GitHub, owner: string, repo: string, ramo: string): Promise<void> {
  if (!isVariantRef(ramo)) throw new ApiError(400, "Variante non valida.");
  await gh.rest.git.deleteRef({ owner, repo, ref: `heads/${ramo}` });
}

/**
 * Unisce una variante nella versione principale (merge Git). Se le stesse righe
 * sono cambiate in entrambe GitHub rifiuta: in quel caso si porta la variante
 * un capitolo alla volta, confrontando e scegliendo.
 */
export async function mergeVariant(gh: GitHub, owner: string, repo: string, ramo: string): Promise<{ unita: boolean }> {
  if (!isVariantRef(ramo)) throw new ApiError(400, "Variante non valida.");
  const { data: info } = await gh.rest.repos.get({ owner, repo });
  try {
    const res = await gh.rest.repos.merge({
      owner,
      repo,
      base: info.default_branch,
      head: ramo,
      commit_message: `Unisce la variante «${variantName(ramo)}»`,
    });
    return { unita: res.status === 201 };
  } catch (err) {
    if (err instanceof RequestError && err.status === 409) {
      throw new ApiError(409, "La variante e la versione principale hanno cambiato gli stessi passaggi: portala un capitolo alla volta, dal confronto nell'editor.");
    }
    throw err;
  }
}
