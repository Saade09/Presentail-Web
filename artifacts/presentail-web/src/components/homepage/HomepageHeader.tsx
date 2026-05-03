import { TopUtilityBar } from "./TopUtilityBar";
import { MainNavbar } from "./MainNavbar";

export function HomepageHeader() {
  return (
    <header className="sticky top-0 z-50">
      <TopUtilityBar />
      <MainNavbar />
    </header>
  );
}
