/** 历史页薄壳:路由适配(双壳共源,页面体在 src/screens/HistoryScreen) */
import { useRouter } from "expo-router";
import { HistoryScreen } from "../src/screens/HistoryScreen";

export default function HistoryPage() {
  const router = useRouter();
  return (
    <HistoryScreen
      onOpenRun={(runId) => router.push(`/result/${runId}`)}
      onNavigateConfig={() => router.push("/")}
    />
  );
}
