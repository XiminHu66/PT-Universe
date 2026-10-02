"""Check that EPUB references resolve offline and images are actually embedded."""
import sys, zipfile, posixpath, xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image
from io import BytesIO
for path in sys.argv[1:] or ['test-results/media-vault/reader.epub','test-results/media-vault/illustrated.epub','test-results/media-vault/book.epub','test-results/media-vault/images-only.epub','test-results/media-vault/selected-chapters.epub','test-results/media-vault/selected-range.epub','test-results/media-vault/styled.epub']:
    with zipfile.ZipFile(path) as z:
        assert z.namelist()[0]=='mimetype'
        assert z.getinfo('mimetype').compress_type==zipfile.ZIP_STORED
        assert z.read('mimetype')==b'application/epub+zip'
        ns={'o':'http://www.idpf.org/2007/opf','h':'http://www.w3.org/1999/xhtml'}
        opf=ET.fromstring(z.read('OEBPS/content.opf'))
        items={i.attrib['id']:i.attrib for i in opf.findall('o:manifest/o:item',ns)}
        for item in items.values():
            assert 'OEBPS/'+item['href'] in z.namelist()
        for item in opf.findall('o:spine/o:itemref',ns):
            assert item.attrib['idref'] in items
        images=[x for x in items.values() if x['media-type'].startswith('image/')]
        for entry in z.namelist():
            if entry.endswith(('.xml','.opf','.xhtml')):
                doc=ET.fromstring(z.read(entry))
                for img in doc.findall('.//h:img',ns):
                    src=img.attrib['src']
                    assert not src.startswith(('http:','https:','data:')),src
                    assert posixpath.normpath(posixpath.join(posixpath.dirname(entry),src)) in z.namelist()
        for img in images:
            with Image.open(BytesIO(z.read('OEBPS/'+img['href']))) as decoded:
                decoded.load()
                assert decoded.width>0 and decoded.height>0
        if Path(path).name!='reader.epub':
            assert images,'EPUB is missing illustrations'
        print(f'{path}: valid XML, offline references, {len(images)} embedded/decoded images')
