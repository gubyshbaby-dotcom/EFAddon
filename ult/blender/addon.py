"""Find the Epic Fight / VIX addon, whichever way it got here.

Inside a normal Blender session the extension is installed and enabled, and its own
__init__ has put efb/efbpy on sys.path. Headless (python3 with the bpy module) nothing is
installed, so the zip in vendor/ is unpacked next to it and registered once.
"""

import os
import sys
import zipfile

from ult import paths

_UNPACKED = os.path.join(paths.ROOT, "vendor", "_ef_blender")


def _unpack():
    marker = os.path.join(_UNPACKED, "blender_manifest.toml")
    if not os.path.exists(marker):
        with zipfile.ZipFile(paths.VENDOR_ADDON) as zf:
            zf.extractall(_UNPACKED)
    if _UNPACKED not in sys.path:
        sys.path.insert(0, _UNPACKED)


def ensure():
    """Import efbpy and make sure its operators are registered. Returns the module."""
    import bpy
    try:
        import efbpy  # noqa: F401
    except ImportError:
        _unpack()
        import efbpy  # noqa: F401
    import efbpy
    if not hasattr(bpy.types, "EFB_OT_generate_rig"):
        efbpy.register()
    return efbpy
