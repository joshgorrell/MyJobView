import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const patches = [
  {
    "file": "meshagent.js",
    "original": "b083881319724c93b9043fc56c7149784f66dcd0ef44fdeb4e6a205bcfc75c1f",
    "patched": "ca0ad6d23a4d80bb4f47c4067b097c7624876257d1021a4767c99e16ef108997",
    "before": "            if ((mesh != null) && (mesh.deleted != null) && (mesh.links)) {",
    "after": "            // MJV guest sessions are terminal: old downloads must never restore access.\n            if (mesh && mesh.deleted && typeof mesh.name === 'string' && mesh.name.startsWith('MJV guest ')) { obj.close(1); return null; }\n            if ((mesh != null) && (mesh.deleted != null) && (mesh.links)) {"
  },
  {
    "file": "meshuser.js",
    "original": "2683d9902631e4b0393a6391d4ae4ce0b6949dfeadd3384e5be7b9f09c36732b",
    "patched": "8be6b0718a2cdd97034de0f3e5a39c15570254dc45caa29a323fe32abb06a732",
    "before": "                    // Mark the mesh as deleted",
    "after": "                    // MJV guest cleanup also closes connected agents; desktop viewers are revoked first.\n                    if (typeof mesh.name === 'string' && mesh.name.startsWith('MJV guest ')) {\n                        for (const id in parent.wsagents) { const agent = parent.wsagents[id]; if (agent.dbMeshKey === mesh._id) { agent.close(1); } }\n                    }\n                    // Mark the mesh as deleted"
  }
];
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function prepareGuestRuntime(directory){
 for(const patch of patches){
  const path=join(directory,patch.file);const bytes=await readFile(path);const hash=digest(bytes);
  if(hash===patch.patched)continue;
  if(hash!==patch.original)throw new Error('unexpected_guest_runtime_source');
  const source=bytes.toString('utf8');if(source.split(patch.before).length!==2)throw new Error('unexpected_guest_patch_target');
  const output=Buffer.from(source.replace(patch.before,patch.after.replaceAll('\n','\r\n')));
  if(digest(output)!==patch.patched)throw new Error('unexpected_guest_patch_result');
  await writeFile(path,output);
 }
}
export async function verifyGuestRuntime(directory){
 for(const patch of patches)if(digest(await readFile(join(directory,patch.file)))!==patch.patched)throw new Error('guest_runtime_preparation_required');
}
