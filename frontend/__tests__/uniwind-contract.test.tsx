/** uniwind×jest 契约:className 组件在 jest-expo(native preset)下可渲染不崩 */
import React from "react";
import { Text, View } from "react-native";
import { render } from "@testing-library/react-native";

it("className 组件在 jest 下可渲染", async () => {
  const { getByText } = await render(
    <View className="flex-1 bg-base-950">
      <Text className="text-ink">vn-demo</Text>
    </View>,
  );
  expect(getByText("vn-demo")).toBeTruthy();
});
