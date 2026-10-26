from pathlib import Path
import json
from zipfile import ZipFile, ZIP_DEFLATED
root=Path(__file__).resolve().parents[1]
version=json.loads((root/'extension'/'manifest.json').read_text())['version']
out=root/'release'/f'x-xiuxian-v{version}.zip'
out.parent.mkdir(parents=True,exist_ok=True)
with ZipFile(out,'w',ZIP_DEFLATED) as z:
    for file in sorted((root/'extension').rglob('*')):
        if file.is_file() and not file.name.startswith('demo.'):
            z.write(file,Path('X修仙')/file.relative_to(root/'extension'))
print(out)
