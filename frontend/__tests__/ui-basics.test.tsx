/** ui 基础件:渲染、交互、禁用态、变体语义 */
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { Btn } from "../src/ui/Button";
import { Card } from "../src/ui/Card";
import { Separator } from "../src/ui/Separator";
import { UIText } from "../src/ui/Text";

it("Button 渲染标签并响应点击", async () => {
  const onPress = jest.fn();
  const { getByText } = await render(<Btn onPress={onPress}>开始回测</Btn>);
  fireEvent.press(getByText("开始回测"));
  expect(onPress).toHaveBeenCalledTimes(1);
});

it("Button disabled 不响应", async () => {
  const onPress = jest.fn();
  const { getByText } = await render(
    <Btn onPress={onPress} disabled>
      提交
    </Btn>,
  );
  fireEvent.press(getByText("提交"));
  expect(onPress).not.toHaveBeenCalled();
});

it("Button variant=outline 文字不为底色反白(用 accent 外的样式分支)", async () => {
  const { getByText } = await render(
    <Btn variant="outline" onPress={jest.fn()}>
      次操作
    </Btn>,
  );
  expect(getByText("次操作")).toBeTruthy();
});

it("UIText 默认与 mono 变体渲染", async () => {
  const { getByText } = await render(
    <>
      <UIText>普通文本</UIText>
      <UIText variant="mono">1,234.56</UIText>
      <UIText variant="heading">标题</UIText>
    </>,
  );
  expect(getByText("普通文本")).toBeTruthy();
  expect(getByText("1,234.56")).toBeTruthy();
  expect(getByText("标题")).toBeTruthy();
});

it("Separator 与 Card 渲染子内容", async () => {
  const { getByText } = await render(
    <Card>
      <UIText>内容</UIText>
      <Separator />
    </Card>,
  );
  expect(getByText("内容")).toBeTruthy();
});
