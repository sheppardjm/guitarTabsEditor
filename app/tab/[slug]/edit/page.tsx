import { notFound } from "next/navigation";
import { getTab } from "@/lib/library";
import TabEditor from "@/components/TabEditor";

export const dynamic = "force-dynamic";

export default async function EditTabPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tab = getTab(slug);
  if (!tab) notFound();
  return <TabEditor tab={tab} />;
}
