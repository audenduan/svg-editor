/** 最小 XML 元素模型：属性保持文件中出现的顺序（round-trip 稳定）。 */
export interface XmlElement {
  readonly name: string;
  readonly attributes: ReadonlyArray<readonly [string, string]>;
  readonly children: readonly XmlElement[];
  /** 直接文本内容（已做实体解码；子元素文本不在其中）。 */
  readonly text: string;
}
