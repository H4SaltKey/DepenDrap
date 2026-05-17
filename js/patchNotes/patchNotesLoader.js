window.PatchNotesLoader = {
  index: null,
  
  loadIndex: async function() {
    try {
      const res = await fetch("patchnotes/index.json?" + new Date().getTime());
      if(res.ok) {
        this.index = await res.json();
      } else {
        console.warn("Failed to load patch notes index.");
      }
    } catch(e) {
      console.warn("Error loading patch notes index", e);
    }
  },

  getLatestPublicVersionId: function() {
    if(!this.index || !this.index.versions) return null;
    // Assuming versions array is ordered (latest last or first? Let's say latest is last in array or we sort by date)
    // Actually, just find the last one with status === "public"
    const publicVersions = this.index.versions.filter(v => v.status === "public");
    if(publicVersions.length === 0) return null;
    return publicVersions[publicVersions.length - 1].id;
  },

  getAllPublicVersionIds: function() {
    if(!this.index || !this.index.versions) return [];
    return this.index.versions.filter(v => v.status === "public").map(v => v.id);
  },

  loadVersion: async function(versionId) {
    try {
      const res = await fetch(\`patchnotes/versions/\${versionId}.json?t=\` + new Date().getTime());
      if(res.ok) {
        return await res.json();
      }
    } catch(e) {
      console.warn("Error loading version", versionId, e);
    }
    return null;
  }
};
