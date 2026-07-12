export default function MediaAssetEditor({
    asset,
    updateAsset,
    uploadFile
})
 {
     console.log(asset);
    return (
        <div className="media-editor">

           {asset.asset_type === "image" ? (
  <img
    src={asset.public_url}
    alt={asset.alt_en}
    className="media-preview"
  />
) : (
  <video
    className="media-preview"
    controls
    width={300}
  >
    <source src={asset.public_url} type="video/mp4" />
    Your browser does not support the video tag.
  </video>
)}
            <input
                type="file"
                accept="image/*,video/*"
                onChange={(e)=>uploadFile(asset,e.target.files[0])}
            />

            <label>English Alt</label>

            <input
                value={asset.alt_en || ""}
                onChange={(e)=>
                    updateAsset("alt_en",e.target.value)
                }
            />

            <label>Tagalog Alt</label>

            <input
                value={asset.alt_tl || ""}
                onChange={(e)=>
                    updateAsset("alt_tl",e.target.value)
                }
            />

        </div>
    );
}