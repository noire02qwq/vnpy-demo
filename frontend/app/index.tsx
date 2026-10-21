/** 配置页薄壳:路由适配(双壳共源,页面体在 src/screens/ConfigScreen) */
import { useRouter } from "expo-router";
import { ConfigScreen } from "../src/screens/ConfigScreen";

export default function Index() {
  const router = useRouter();
  return (
    <ConfigScreen
      onSubmit={(runId) => router.push(`/result/${runId}`)}
      onOpenHistory={() => router.push("/history")}
    />
  );
}
