import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePaymentMethods1787616000000 implements MigrationInterface {
  name = 'CreatePaymentMethods1787616000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await queryRunner.query(`
      CREATE TABLE "payment_methods" (
        "id" SERIAL NOT NULL,
        "guid" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying(200) NOT NULL,
        "nameAr" character varying(200),
        "fixedFees" numeric(10,2) NOT NULL DEFAULT 0,
        "percentageFees" numeric(10,2) NOT NULL DEFAULT 0,
        "isEnabled" boolean NOT NULL DEFAULT true,
        "createdOn" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payment_methods_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payment_methods_guid" UNIQUE ("guid"),
        CONSTRAINT "CHK_payment_methods_fixed_fees_non_negative" CHECK ("fixedFees" >= 0),
        CONSTRAINT "CHK_payment_methods_percentage_fees_non_negative" CHECK ("percentageFees" >= 0)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "payment_methods"');
  }
}
