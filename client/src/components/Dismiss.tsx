// Transparent full-screen layer rendered behind an open popover/menu so that a
// click anywhere outside it closes the menu (without triggering clicks beneath).
export function Dismiss({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[5]"
      onClick={(e) => {
        e.stopPropagation();
        onDismiss();
      }}
    />
  );
}
