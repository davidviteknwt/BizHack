// Settings for the project-folder scan. The folder is addressed by its OneDrive/SharePoint sharing link.
const raw = $input.first().json;
const b = raw.body ?? raw;
const shareUrl = b.share_url || 'https://nwt-my.sharepoint.com/:f:/g/personal/david_vitek_nwt_cz/IgAiU2OyPMSMT7nSdNQUVrTzAQvTwv9hsCKAPw9yoM2Fr9c?e=0ITPdb';
// Graph "shares" id: u! + base64url(sharing URL)
const shareId = 'u!' + Buffer.from(shareUrl, 'utf8').toString('base64').replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
return [{
  json: {
    started_ms: Date.now(),
    share_url: shareUrl,
    share_id: shareId,
    projects_subfolder: b.projects_subfolder ?? 'sample_projects', // projects live in this subfolder of the shared folder ('' = the shared folder itself)
    existing_codes: Array.isArray(b.existing_codes) ? b.existing_codes : [],
  },
}];
