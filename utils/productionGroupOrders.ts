import { type StartMaterialDeliveryRow, type StartMaterialGroup, type StartMaterialPiece } from '../components/production/StartProductionModal';

const toNumber = (value: any) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export type GroupOrderRequirement = {
  orderId: string;
  orderName: string;
  orderCode: string;
  rowIndex: number;
  rowKey: string;
  pieces: StartMaterialPiece[];
  totalPerItemUsage: number;
  totalUsage: number;
};

export type GroupStartMaterial = StartMaterialGroup & {
  orderRequirements: GroupOrderRequirement[];
};

type BuildGroupStartMaterialsParams = {
  orders: any[];
  orderRowsMap: Record<string, any[]>;
  orderQuantityMap: Record<string, number>;
  categoryLabelMap: Map<string, string>;
  productMetaMap: Map<string, { name: string; system_code: string }>;
};

const getRowSelectedProduct = (row: any, productMetaMap: Map<string, { name: string; system_code: string }>) => {
  const header = row?.header || {};
  const pieces = Array.isArray(row?.pieces) ? row.pieces : [];
  const selectedProductId =
    header?.selected_product_id ||
    row?.selected_product_id ||
    row?.product_id ||
    pieces.find((piece: any) => piece?.selected_product_id || piece?.product_id)?.selected_product_id ||
    pieces.find((piece: any) => piece?.selected_product_id || piece?.product_id)?.product_id ||
    null;
  const selectedProductMeta = selectedProductId ? productMetaMap.get(String(selectedProductId)) : null;
  const selectedProductName =
    header?.selected_product_name ||
    row?.selected_product_name ||
    row?.product_name ||
    selectedProductMeta?.name ||
    '-';
  const selectedProductCode =
    header?.selected_product_code ||
    row?.selected_product_code ||
    row?.product_system_code ||
    selectedProductMeta?.system_code ||
    '';
  return {
    selectedProductId: selectedProductId ? String(selectedProductId) : null,
    selectedProductName: String(selectedProductName || '-'),
    selectedProductCode: String(selectedProductCode || ''),
  };
};

export const buildGroupStartMaterials = ({
  orders,
  orderRowsMap,
  orderQuantityMap,
  categoryLabelMap,
  productMetaMap,
}: BuildGroupStartMaterialsParams): GroupStartMaterial[] => {
  const grouped = new Map<string, GroupStartMaterial>();

  orders.forEach((order: any) => {
    const orderId = String(order?.id || '');
    if (!orderId) return;
    const orderName = String(order?.name || '-');
    const orderCode = String(order?.system_code || '');
    const rawRows = Array.isArray(orderRowsMap[orderId]) ? orderRowsMap[orderId] : [];
    const orderQty = Math.max(1, toNumber(orderQuantityMap[orderId] ?? order?.quantity ?? 1));

    rawRows.forEach((row: any, rowIndex: number) => {
      const categoryValue = String(row?.header?.category || '');
      const categoryLabel = categoryLabelMap.get(categoryValue) || categoryValue || 'بدون دسته‌بندی';
      const rowPieces = Array.isArray(row?.pieces) && row.pieces.length > 0 ? row.pieces : [row];
      const { selectedProductId, selectedProductName, selectedProductCode } = getRowSelectedProduct(row, productMetaMap);
      if (!selectedProductId) return;

      const pieces: StartMaterialPiece[] = rowPieces.map((piece: any, pieceIndex: number) => {
        const totalUsageRaw = toNumber(piece?.total_usage);
        const perItemUsageRaw = toNumber(piece?.final_usage);
        const perItemUsage = perItemUsageRaw > 0
          ? perItemUsageRaw
          : (totalUsageRaw > 0 ? totalUsageRaw / orderQty : 0);
        const totalUsage = totalUsageRaw > 0
          ? totalUsageRaw
          : perItemUsage * orderQty;
        const subPerItemUsageRaw = toNumber(piece?.qty_sub);
        const subUsage = subPerItemUsageRaw > 0
          ? subPerItemUsageRaw * orderQty
          : 0;
        const quantity = toNumber(piece?.quantity) || 1;
        return {
          key: `${orderId}_${rowIndex}_${pieceIndex}_${String(piece?.key || 'piece')}`,
          name: String(piece?.name || `قطعه ${pieceIndex + 1}`),
          length: toNumber(piece?.length),
          width: toNumber(piece?.width),
          quantity,
          totalQuantity: quantity * orderQty,
          mainUnit: String(piece?.main_unit || row?.header?.main_unit || ''),
          subUnit: String(piece?.sub_unit || ''),
          subUsage,
          perItemUsage,
          totalUsage,
        };
      });

      const totalPerItemUsage = pieces.reduce((sum, piece) => sum + toNumber(piece.perItemUsage), 0);
      const totalUsage = pieces.reduce((sum, piece) => sum + toNumber(piece.totalUsage), 0);
      const rowKey = `${String(row?.key || 'group')}_${rowIndex}`;

      const requirement: GroupOrderRequirement = {
        orderId,
        orderName,
        orderCode,
        rowIndex,
        rowKey,
        pieces,
        totalPerItemUsage,
        totalUsage,
      };

      const groupKey = `${categoryValue}::${selectedProductId}`;
      const existing = grouped.get(groupKey);
      if (!existing) {
        grouped.set(groupKey, {
          key: groupKey,
          rowIndex: grouped.size,
          categoryLabel,
          selectedProductId,
          selectedProductName,
          selectedProductCode,
          sourceShelfId: null,
          productionShelfId: null,
          pieces: [...pieces],
          deliveryRows: [],
          totalPerItemUsage,
          totalUsage,
          totalDeliveredQty: 0,
          collapsed: grouped.size !== 0,
          isConfirmed: false,
          orderRequirements: [requirement],
        });
      } else {
        existing.pieces = [...existing.pieces, ...pieces];
        existing.totalPerItemUsage += totalPerItemUsage;
        existing.totalUsage += totalUsage;
        existing.orderRequirements = [...existing.orderRequirements, requirement];
        grouped.set(groupKey, existing);
      }
    });
  });

  return Array.from(grouped.values()).map((group, index) => ({
    ...group,
    rowIndex: index,
  }));
};

export type RequirementDeliveryAllocation = {
  orderId: string;
  rowKey: string;
  rowIndex: number;
  deliveredQty: number;
  pieceDeliveredByKey: Record<string, number>;
  pieceDeliveredByIndex: Record<number, number>;
};

export const splitDeliveredAcrossRequirements = (
  group: GroupStartMaterial
): RequirementDeliveryAllocation[] => {
  const requirements = Array.isArray(group.orderRequirements) ? group.orderRequirements : [];
  if (!requirements.length) return [];
  const totalDelivered = toNumber(group.totalDeliveredQty);
  if (totalDelivered <= 0) return [];

  const needSum = requirements.reduce((sum, req) => sum + Math.max(0, toNumber(req.totalUsage)), 0);
  let remaining = totalDelivered;

  return requirements.map((req, index) => {
    const isLast = index === requirements.length - 1;
    const baseNeed = Math.max(0, toNumber(req.totalUsage));
    let deliveredQty = 0;
    if (isLast) {
      deliveredQty = remaining;
    } else if (needSum > 0) {
      const ratio = baseNeed / needSum;
      deliveredQty = totalDelivered * ratio;
      remaining -= deliveredQty;
    } else {
      deliveredQty = totalDelivered / requirements.length;
      remaining -= deliveredQty;
    }
    deliveredQty = Math.max(0, deliveredQty);

    const reqPieces = Array.isArray(req.pieces) ? req.pieces : [];
    const pieceNeedSum = reqPieces.reduce((sum, piece) => sum + Math.max(0, toNumber(piece.totalUsage)), 0);
    const pieceDeliveredByKey: Record<string, number> = {};
    const pieceDeliveredByIndex: Record<number, number> = {};
    let pieceRemaining = deliveredQty;
    reqPieces.forEach((piece, pieceIndex) => {
      const pieceKey = String(piece?.key || `${req.orderId}_${req.rowKey}_${pieceIndex}`);
      let qty = 0;
      const isLastPiece = pieceIndex === reqPieces.length - 1;
      if (isLastPiece) {
        qty = pieceRemaining;
      } else if (pieceNeedSum > 0) {
        const ratio = Math.max(0, toNumber(piece?.totalUsage)) / pieceNeedSum;
        qty = deliveredQty * ratio;
        pieceRemaining -= qty;
      } else {
        qty = deliveredQty / Math.max(1, reqPieces.length);
        pieceRemaining -= qty;
      }
      pieceDeliveredByKey[pieceKey] = Math.max(0, qty);
      pieceDeliveredByIndex[pieceIndex] = Math.max(0, qty);
    });

    return {
      orderId: req.orderId,
      rowKey: req.rowKey || `${req.orderId}_${index}`,
      rowIndex: Number.isFinite(req.rowIndex as number) ? (req.rowIndex as number) : index,
      deliveredQty,
      pieceDeliveredByKey,
      pieceDeliveredByIndex,
    };
  });
};

export const sumDeliveredRows = (rows: StartMaterialDeliveryRow[]) =>
  (Array.isArray(rows) ? rows : []).reduce(
    (sum, row) =>
      sum
      + (Math.max(0, toNumber(row?.length))
      * Math.max(0, toNumber(row?.width))
      * Math.max(0, toNumber(row?.quantity))),
    0
  );
