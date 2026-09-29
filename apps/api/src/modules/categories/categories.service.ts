import { Injectable, Inject, HttpStatus } from '@nestjs/common';
import { eq, and, sql, not } from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import { categories, courses, Category } from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { ApiException } from '../../common/errors/api-error';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { slugify } from '../../common/utils/slug.util';

@Injectable()
export class CategoriesService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  async create(
    dto: CreateCategoryDto,
    actorId?: string,
    ipAddress?: string,
    userAgent?: string,
    requestId?: string
  ): Promise<Category> {
    const slug = dto.slug ? slugify(dto.slug) : slugify(dto.name);

    // 1. Check for duplicate name
    const [existingName] = await this.db
      .select()
      .from(categories)
      .where(eq(categories.name, dto.name))
      .limit(1);

    if (existingName) {
      throw new ApiException(
        `Category with name "${dto.name}" already exists`,
        HttpStatus.CONFLICT,
        'CATEGORY_NAME_EXISTS'
      );
    }

    // 2. Check for duplicate slug
    const [existingSlug] = await this.db
      .select()
      .from(categories)
      .where(eq(categories.slug, slug))
      .limit(1);

    if (existingSlug) {
      throw new ApiException(
        `Category with slug "${slug}" already exists`,
        HttpStatus.CONFLICT,
        'CATEGORY_SLUG_EXISTS'
      );
    }

    // 3. Insert record
    const [created] = await this.db
      .insert(categories)
      .values({
        name: dto.name,
        slug,
        description: dto.description || null,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
      })
      .returning();

    // 4. Record audit event
    await this.auditService.record({
      actorId,
      action: 'CATEGORY_CREATED',
      targetType: 'CATEGORY',
      targetId: created.id,
      ipAddress,
      userAgent,
      requestId,
      metadata: {
        name: created.name,
        slug: created.slug,
      },
    });

    return created;
  }

  async findAllAdmin(): Promise<Category[]> {
    return this.db.select().from(categories).orderBy(categories.name);
  }

  async findById(id: string): Promise<Category> {
    const [category] = await this.db
      .select()
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1);

    if (!category) {
      throw new ApiException(
        `Category with ID "${id}" not found`,
        HttpStatus.NOT_FOUND,
        'CATEGORY_NOT_FOUND'
      );
    }

    return category;
  }

  async update(
    id: string,
    dto: UpdateCategoryDto,
    actorId?: string,
    ipAddress?: string,
    userAgent?: string,
    requestId?: string
  ): Promise<Category> {
    const existing = await this.findById(id);

    const updatedFields: string[] = [];
    const updates: Partial<typeof categories.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (dto.name !== undefined && dto.name !== existing.name) {
      const [nameConflict] = await this.db
        .select()
        .from(categories)
        .where(and(eq(categories.name, dto.name), not(eq(categories.id, id))))
        .limit(1);

      if (nameConflict) {
        throw new ApiException(
          `Category with name "${dto.name}" already exists`,
          HttpStatus.CONFLICT,
          'CATEGORY_NAME_EXISTS'
        );
      }
      updates.name = dto.name;
      updatedFields.push('name');
    }

    if (dto.slug !== undefined) {
      const normalizedSlug = slugify(dto.slug);
      if (normalizedSlug !== existing.slug) {
        const [slugConflict] = await this.db
          .select()
          .from(categories)
          .where(and(eq(categories.slug, normalizedSlug), not(eq(categories.id, id))))
          .limit(1);

        if (slugConflict) {
          throw new ApiException(
            `Category with slug "${normalizedSlug}" already exists`,
            HttpStatus.CONFLICT,
            'CATEGORY_SLUG_EXISTS'
          );
        }
        updates.slug = normalizedSlug;
        updatedFields.push('slug');
      }
    }

    if (dto.description !== undefined && dto.description !== existing.description) {
      updates.description = dto.description;
      updatedFields.push('description');
    }

    if (dto.isActive !== undefined && dto.isActive !== existing.isActive) {
      updates.isActive = dto.isActive;
      updatedFields.push('isActive');
    }

    if (updatedFields.length === 0) {
      return existing;
    }

    const [updated] = await this.db
      .update(categories)
      .set(updates)
      .where(eq(categories.id, id))
      .returning();

    await this.auditService.record({
      actorId,
      action: 'CATEGORY_UPDATED',
      targetType: 'CATEGORY',
      targetId: id,
      ipAddress,
      userAgent,
      requestId,
      metadata: {
        updatedFields,
      },
    });

    return updated;
  }

  async delete(
    id: string,
    actorId?: string,
    ipAddress?: string,
    userAgent?: string,
    requestId?: string
  ): Promise<{ deleted: true; id: string }> {
    const existing = await this.findById(id);

    // Check for associated courses to respect RESTRICT rule
    const [coursesCheck] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(courses)
      .where(eq(courses.categoryId, id));

    if (coursesCheck && coursesCheck.count > 0) {
      throw new ApiException(
        'Cannot delete category with associated courses',
        HttpStatus.CONFLICT,
        'CATEGORY_HAS_COURSES'
      );
    }

    await this.db.delete(categories).where(eq(categories.id, id));

    await this.auditService.record({
      actorId,
      action: 'CATEGORY_DELETED',
      targetType: 'CATEGORY',
      targetId: id,
      ipAddress,
      userAgent,
      requestId,
      metadata: {
        name: existing.name,
        slug: existing.slug,
      },
    });

    return { deleted: true, id };
  }

  async findPublicCategories(): Promise<
    Array<{
      id: string;
      name: string;
      slug: string;
      description: string | null;
      courseCount: number;
    }>
  > {
    const result = await this.db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        description: categories.description,
        courseCount: sql<number>`count(case when ${courses.status} = 'PUBLISHED' and ${courses.visibility} = 'PUBLIC' then ${courses.id} end)::int`,
      })
      .from(categories)
      .leftJoin(courses, eq(categories.id, courses.categoryId))
      .where(eq(categories.isActive, true))
      .groupBy(categories.id, categories.name, categories.slug, categories.description)
      .orderBy(categories.name);

    return result;
  }

  async findPublicCategoryBySlug(slug: string): Promise<Category> {
    const [category] = await this.db
      .select()
      .from(categories)
      .where(and(eq(categories.slug, slug), eq(categories.isActive, true)))
      .limit(1);

    if (!category) {
      throw new ApiException(
        `Category with slug "${slug}" not found`,
        HttpStatus.NOT_FOUND,
        'CATEGORY_NOT_FOUND'
      );
    }

    return category;
  }
}
