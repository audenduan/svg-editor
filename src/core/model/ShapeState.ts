/**
 * 图形可变状态的快照（Memento）。
 *
 * 撤销/重做不靠"反算"（例如把 `scale 2` 撤销成 `scale 0.5`），而是靠快照还原，
 * 这样浮点误差、属性白名单变化都不会让 undo 后的文档和之前对不上。
 * 结构性变化（增删、改父、改序）由各条命令自己记录"原来的父容器 + 下标"。
 */
export interface ShapeState {
  readonly numericAttributes: ReadonlyArray<readonly [string, number]>;
  readonly styles: ReadonlyArray<readonly [string, string]>;
  readonly extraAttributes: ReadonlyArray<readonly [string, string]>;
  /** 文本内容（只有 text 图形有）；`null` 表示该图形没有可撤销的文本状态。 */
  readonly text: string | null;
}
