import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShopItemDisplayOnCheckout1787400000000
  implements MigrationInterface
{
  name = 'AddShopItemDisplayOnCheckout1787400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "shop_items" ADD COLUMN IF NOT EXISTS "displayOnCheckout" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_shop_items_display_on_checkout" ON "shop_items" ("displayOnCheckout")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_shop_items_display_on_checkout"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shop_items" DROP COLUMN IF EXISTS "displayOnCheckout"`,
    );
  }
}
