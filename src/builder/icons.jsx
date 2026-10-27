// Small line drawings for the shape buttons.
const paths = {
  box: <path d="M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8" />,
  cylinder: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="2.6" />
      <path d="M5 6v12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6" />
    </>
  ),
  tube: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="2.6" />
      <ellipse cx="12" cy="6" rx="3.5" ry="1.2" />
      <path d="M5 6v12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6" />
    </>
  ),
  sphere: (
    <>
      <circle cx="12" cy="12" r="8" />
      <ellipse cx="12" cy="12" rx="8" ry="3" />
    </>
  ),
  cone: (
    <>
      <path d="M12 3L5 18M12 3l7 15" />
      <ellipse cx="12" cy="18" rx="7" ry="2.6" />
    </>
  ),
  polygon: <path d="M8 4h8l4 7-4 7H8l-4-7zM4 11h16" />,
  text: <path d="M5 6V4h14v2M12 4v16M9 20h6" />,
  sketch: <path d="M4 18l4-10 5 6 3-4 4 8zM15 4l5 5-2 2-5-5z" />,
};

export function ShapeIcon({ type }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      {paths[type]}
    </svg>
  );
}
