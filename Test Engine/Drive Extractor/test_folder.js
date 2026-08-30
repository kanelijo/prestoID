const { getServiceAccountToken } = require('./drive_service');

async function scanAllSubfolders() {
  const rootId = '1meptDSGygpp8bJ3l1sPcc4Qw9953uUgU';
  const token = await getServiceAccountToken();

  const q = `'${rootId}' in parents and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType)`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();

  console.log(`📁 Found ${data.files.length} Category Folders:`);
  for (const folder of data.files) {
    console.log(`\n📂 Category: "${folder.name}" (ID: ${folder.id})`);
    const subQ = `'${folder.id}' in parents and trashed = false`;
    const subUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(subQ)}&fields=files(id,name,mimeType,size)`;
    const subRes = await fetch(subUrl, { headers: { Authorization: `Bearer ${token}` } });
    const subData = await subRes.json();
    if (subData.files && subData.files.length > 0) {
      for (const item of subData.files) {
        console.log(`   📄 [${item.mimeType.includes('folder') ? 'FOLDER' : 'FILE'}] ${item.name} (${item.size || '0'} bytes)`);
      }
    } else {
      console.log('   (Empty folder - waiting for PDFs)');
    }
  }
}

scanAllSubfolders().catch(console.error);
