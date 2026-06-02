/**
 * CUID 在同一批次创建时常共享相同前缀，仅截取前几位会在列表中“撞号”。
 * 展示末尾若干位更能区分不同实体。
 */
export function formatShortEntityId(id: string, length = 8): string {
  if (id.length <= length) return id;
  return `…${id.slice(-length)}`;
}
