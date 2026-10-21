/** 结果页薄壳:路由 id → ResultScreen(双壳共源,页面体在 src/screens/ResultScreen) */
import { useLocalSearchParams, useRouter } from "expo-router";
import { ResultScreen } from "../../src/screens/ResultScreen";

export default function ResultPage() {
  const params = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  if (params.id === undefined) {
    return null;
  }
  return <ResultScreen runId={params.id} onBack={() => router.back()} />;
}
