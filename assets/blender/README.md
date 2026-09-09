# Editable Blender sources

The repository contains the vehicle master `source-reference.blend`, current
`rabbit.blend`, `sheep.blend`, `dog.blend` and `dragon.blend` scenes, the early
`v1/` inputs used by rabbit/sheep rebuilding, and the `frozen/` delivery inputs.

The complete build order is documented in the root README. Running
`scripts/blender_build_assets.py` alone rebuilds the early v1 family, not the
current faces. Do not overwrite hand-edited scenes without retaining a copy.

Blender-native coordinates are Z up and -Y forward. GLB converts these to Y up
and +Z forward, with tire contact at y=0. The movable root is `kart_{id}`;
`wheel_fl`, `wheel_fr`, `wheel_rl` and `wheel_rr` each keep three mesh children
and roll around local X.

Near GLBs embed one facial normal map. Distant GLBs preserve all vehicle,
clothing and tire geometry while simplifying the face and omitting micro-normal
textures. They are derived from the current scenes without modifying them.

Generated studio images, intermediate unmerged dog/dragon sculpts and validation
reports are local outputs under `artifacts/` and are ignored by Git.
