Sprite assets.

For the Prince demo, save the two reference images here as:
  assets/prince_front.png   (front-facing Prince)
  assets/prince_back.png    (back-facing Prince)

Transparent background is best. White/solid background also works —
the demo strips the background by an edge flood-fill, but only when the
page is SERVED (run .\start.ps1), not opened as a file:// URL.
