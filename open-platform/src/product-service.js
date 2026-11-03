const ITEM_STATUSES = new Set(['NORMAL', 'BANNED', 'UNLIST', 'REVIEWING', 'SELLER_DELETE', 'SHOPEE_DELETE']);

export class ProductService {
  constructor(session) {
    this.session = session;
  }

  async listItems(shopId, { statuses = ['NORMAL'], offset = 0, pageSize = 100 } = {}) {
    if (!Array.isArray(statuses) || !statuses.length || statuses.some(status => !ITEM_STATUSES.has(status))) {
      throw new TypeError('statuses must contain valid Shopee item statuses');
    }
    if (!Number.isSafeInteger(offset) || offset < 0) throw new TypeError('offset must be non-negative');
    if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new TypeError('pageSize must be 1–100');
    const result = await this.session.request(shopId, {
      path: '/api/v2/product/get_item_list',
      query: { offset, page_size: pageSize, item_status: statuses },
    });
    return result.response;
  }
}
