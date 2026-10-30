/** Wird bei jedem Seitenwechsel neu aufgebaut → Inhalt blendet dezent ein. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="anim-page">{children}</div>;
}
