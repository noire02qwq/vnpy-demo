/** 表单件与状态行:输入回传、选中态、onChange、状态行上下文与重试 */
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { Input } from "../src/ui/Input";
import { Label } from "../src/ui/Label";
import { Segmented } from "../src/ui/Segmented";
import { StatusLine } from "../src/ui/StatusLine";

it("Input 受控输入回传文本", async () => {
  const onChange = jest.fn();
  const { getByDisplayValue } = await render(
    <Input value="AAPL" onChange={onChange} placeholder="标的" />,
  );
  fireEvent.changeText(getByDisplayValue("AAPL"), "MSFT");
  expect(onChange).toHaveBeenCalledWith("MSFT");
});

it("Label 渲染文本", async () => {
  const { getByText } = await render(<Label>标的时代</Label>);
  expect(getByText("标的时代")).toBeTruthy();
});

it("Segmented 渲染选项并回传选中", async () => {
  const onChange = jest.fn();
  const { getByText } = await render(
    <Segmented
      options={[
        { value: "cross", label: "金死叉对卖" },
        { value: "tpsl", label: "固定止盈止损" },
      ]}
      value="cross"
      onChange={onChange}
    />,
  );
  fireEvent.press(getByText("固定止盈止损"));
  expect(onChange).toHaveBeenCalledWith("tpsl");
});

it("StatusLine 渲染品牌、后端状态与右上下文", async () => {
  const onRetry = jest.fn();
  const { getByText } = await render(
    <StatusLine backendOk={false} onRetry={onRetry} right="8 FORMS · AAPL" />,
  );
  expect(getByText("VND-DEMO")).toBeTruthy();
  expect(getByText("BACKEND OFFLINE")).toBeTruthy();
  expect(getByText("8 FORMS · AAPL")).toBeTruthy();
  fireEvent.press(getByText("BACKEND OFFLINE"));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

it("StatusLine 三态文案(probing/online)与禁用重试", async () => {
  const { getByText, rerender } = await render(<StatusLine backendOk={null} />);
  expect(getByText("PROBING")).toBeTruthy();
  await rerender(<StatusLine backendOk={true} />);
  expect(getByText("BACKEND ONLINE")).toBeTruthy();
});
