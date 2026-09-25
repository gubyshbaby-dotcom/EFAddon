"""Build out/ult_sendai.blend from scratch.

    python3 scripts/build.py [--no-env] [--no-save]
    blender --background --python scripts/build.py -- [--no-env]
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ult.blender import build  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
build.build(save="--no-save" not in args, with_env="--no-env" not in args)
print("built", build.SLICE)
