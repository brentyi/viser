"""Helper script for dumping Tabler icon names into a Literal type."""

import zipfile
from pathlib import Path

HERE_DIR = Path(__file__).absolute().parent
ICON_DIR = HERE_DIR / "_icons"


def enum_name_from_icon(name: str) -> str:
    """Capitalize an icon name for use as an enum name."""
    name = name.upper()
    name = name.replace("-", "_")
    if name[0].isdigit():
        name = "ICON_" + name
    return name


if __name__ == "__main__":
    with zipfile.ZipFile(ICON_DIR / "tabler-icons.zip") as zip_file:
        icon_names = sorted(
            [Path(name).stem for name in zip_file.namelist() if name.endswith(".svg")]
        )

    # Generate stub file. This is used by type checkers.
    (HERE_DIR / "_icons_enum.pyi").write_text(
        "\n".join(
            [
                "# Automatically generated by `_icons_generate_enum.py`",
                "# See https://tabler-icons.io/",
                "import enum",
                "from typing import NewType",
                "",
                "IconName = NewType('IconName', str)",
                '"""Name of an icon. Should be generated via `viser.Icon.*`."""',
                "",
                "class Icon:",
                '    """\'Enum\' class for referencing Tabler icons.',
                "",
                "    We don't subclass enum.Enum for performance reasons -- importing an enum with",
                "    thousands of names can result in import times in the hundreds of milliseconds.",
                '    """',
                "",
            ]
            + [
                # Prefix all icon names with ICON_, since some of them start with
                # numbers and can't directly be used as Python names.
                f"    {enum_name_from_icon(icon)}: IconName = IconName('{icon}')"
                for icon in icon_names
            ]
        )
    )

    # Generate source. This is used at runtime + by Sphinx for documentation.
    (HERE_DIR / "_icons_enum.py").write_text(
        "\n".join(
            [
                "# Automatically generated by `_icons_generate_enum.py`",
                "# See https://tabler-icons.io/",
                "from typing import NewType",
                "",
                "IconName = NewType('IconName', str)",
                '"""Name of an icon. Should be generated via `viser.Icon.*`."""',
                "",
                "",
                "class _IconStringConverter(type):",
                "    def __getattr__(self, __name: str) -> IconName:",
                '        if not __name.startswith("_"):',
                '            return IconName(__name.lower().replace("_", "-"))',
                "        else:",
                "            raise AttributeError()",
                "",
                "",
                "class Icon(metaclass=_IconStringConverter):",
                '    """\'Enum\' class for referencing Tabler icons.',
                "",
                "    We don't subclass enum.Enum for performance reasons -- importing an enum with",
                "    thousands of names can result in import times in the hundreds of milliseconds.",
                "",
                "    Attributes:",
            ]
            + [
                # Prefix all icon names with ICON_, since some of them start with
                # numbers and can't directly be used as Python names.
                f"        {enum_name_from_icon(icon)} (IconName): The :code:`{icon}` icon."
                for icon in icon_names
            ]
            + ['    """']
        )
    )
