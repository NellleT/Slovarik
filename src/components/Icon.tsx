const paths = {
  speaker: (
    <>
      <path d="M4 9.5h2.5L10 6.5v11l-3.5-3H4z" />
      <path d="M13.5 9a4 4 0 0 1 0 6" />
      <path d="M16 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  sliders: (
    <>
      <path d="M4.5 8h8M16.5 8h3M4.5 16h3M11.5 16h8" />
      <circle cx="14.5" cy="8" r="2" />
      <circle cx="9.5" cy="16" r="2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m19.5 19.5-4-4" />
    </>
  ),
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  undo: (
    <>
      <path d="M8.5 7 5 10.5 8.5 14" />
      <path d="M5.5 10.5h9a4.5 4.5 0 0 1 0 9H11" />
    </>
  ),
  edit: (
    <>
      <path d="M14.5 6.5l3 3L9 18H6v-3z" />
      <path d="M13 8l3 3" />
    </>
  ),
};

export type IconName = keyof typeof paths;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
