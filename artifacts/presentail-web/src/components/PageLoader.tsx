export function PageLoader() {
  return (
    <div
      className="flex items-center justify-center min-h-[40vh]"
      aria-label="Loading" // i18n-ignore
      role="status"
    >
      <span className="inline-block w-8 h-8 border-4 border-current border-t-transparent rounded-full animate-spin opacity-40" />
    </div>
  );
}
