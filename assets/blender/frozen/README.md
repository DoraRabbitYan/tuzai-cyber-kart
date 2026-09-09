# Frozen delivery inputs

These files are copied from the accepted modeling revision and tracked as
rebuild inputs. They are not generated-output placeholders.

- `dragon-round5.blend`: accepted dragon geometry for the delivery surface patch.
- `dragon-normal.png`: final embedded surface normal used by that patch.
- `dog-round5.glb`, `dragon-round5.glb`: optional historical baselines for
  `scripts/dogdragon_verify_revision.py`.

`scripts/blender_patch_dogdragon_surface.py` reads the frozen dragon inputs and
writes current runtime assets plus optional local metrics. None of these frozen
inputs is written by a build. The original local `artifacts/` copies were kept.
