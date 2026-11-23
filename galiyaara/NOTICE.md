# Galiyaara integration in POLITICS

Original project: [Galiyaara by ni_sh_a.char](https://github.com/ni-sh-a-char/Galiyaara).

The user supplied the `Galiyaara-main.zip` source archive. The original `public/js/gallery.js` and bundled Three.js 0.180 files were copied into `galiyaara/`; their original Git blob hashes were verified against the supplied archive before integration. The upstream `package.json` declares **MIT** for Galiyaara.

**Changes to the original corridor module:** POLITICS' uploaded `wallpaper/*.jpeg` artwork is mounted on Three.js wall planes; atmospheric wall/stone/floor colors are adjusted to the existing POLITICS palette; the starting camera is closer to the first frame; Galiyaara input handlers are released when a filtered gallery is rebuilt; unavailable source portraits use a visibly marked neutral silhouette instead of fictional photos.

The original Galiyaara walk, camera motion, moonlit sky, star effects, frame focusing, click behavior and lighting implementation remain in use. `assets/js/issue-stances.js` supplies candidate and issue-sheet data through a separate adapter.

Three.js license text is preserved in `galiyaara/vendor/THREE-LICENSE`.

No original Galiyaara photography is used for politician portraits. Political background imagery is loaded from the user's own POLITICS `wallpaper/` directory.

Source attribution appears in the Issue Stances interface.
