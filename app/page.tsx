import { listTabs } from "@/lib/library";
import LibraryBrowser from "@/components/LibraryBrowser";

export default function LibraryPage() {
  const tabs = listTabs().map(({ content, ...meta }) => meta);
  return <LibraryBrowser tabs={tabs} />;
}
