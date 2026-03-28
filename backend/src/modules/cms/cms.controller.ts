import { Request, Response } from 'express';
import { CmsService } from './services/cms.service';
import { HeroSlideService } from './services/hero-slide.service';
import { sendSuccess, sendCreated, sendPaginated, sendNoContent } from '../../utils/api-response';

const cmsService = new CmsService();
const heroSlideService = new HeroSlideService();

// ─── Public ──────────────────────────────────────────────────────────────────

export const getPageBySlug = async (req: Request, res: Response) => {
  const page = await cmsService.getPageBySlug(req.params['slug'] as string);
  sendSuccess(res, page);
};

export const listPublishedBlogs = async (req: Request, res: Response) => {
  const { page, limit, tag } = req.query as Record<string, string | undefined>;
  const result = await cmsService.listPublishedBlogs({
    page: page ? parseInt(page, 10) : undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
    tag,
  });
  sendPaginated(res, result.blogs, result.meta, 'Blog posts');
};

export const getBlogBySlug = async (req: Request, res: Response) => {
  const blog = await cmsService.getBlogBySlug(req.params['slug'] as string);
  sendSuccess(res, blog);
};

export const getSitemap = async (req: Request, res: Response) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const xml = await cmsService.generateSitemap(baseUrl);
  res.setHeader('Content-Type', 'application/xml');
  res.send(xml);
};

export const getRobotsTxt = async (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/plain');
  res.send(`User-agent: *\nAllow: /\nSitemap: /sitemap.xml\nDisallow: /admin\nDisallow: /api\n`);
};

// ─── Admin: Pages ────────────────────────────────────────────────────────────

export const adminListPages = async (_req: Request, res: Response) => {
  const pages = await cmsService.listPages();
  sendSuccess(res, pages);
};

export const adminCreatePage = async (req: Request, res: Response) => {
  const page = await cmsService.createPage(req.body, req.user!.userId);
  sendCreated(res, page, 'Page created');
};

export const adminUpdatePage = async (req: Request, res: Response) => {
  const page = await cmsService.updatePage(req.params['id'] as string, req.body, req.user!.userId);
  sendSuccess(res, page, 'Page updated');
};

export const adminDeletePage = async (req: Request, res: Response) => {
  await cmsService.deletePage(req.params['id'] as string);
  sendNoContent(res);
};

// ─── Admin: Blog ─────────────────────────────────────────────────────────────

export const adminListBlogs = async (req: Request, res: Response) => {
  const { page, limit } = req.query as Record<string, string | undefined>;
  const result = await cmsService.listAllBlogs({
    page: page ? parseInt(page, 10) : undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
  });
  sendPaginated(res, result.blogs, result.meta, 'Blog posts');
};

export const adminCreateBlog = async (req: Request, res: Response) => {
  const blog = await cmsService.createBlog(req.body, req.user!.userId);
  sendCreated(res, blog, 'Blog post created');
};

export const adminUpdateBlog = async (req: Request, res: Response) => {
  const blog = await cmsService.updateBlog(req.params['id'] as string, req.body);
  sendSuccess(res, blog, 'Blog post updated');
};

export const adminDeleteBlog = async (req: Request, res: Response) => {
  await cmsService.deleteBlog(req.params['id'] as string);
  sendNoContent(res);
};

// ─── Public: Hero Slides ────────────────────────────────────────────────────

export const getActiveHeroSlides = async (_req: Request, res: Response) => {
  const slides = await heroSlideService.getActiveSlides();
  sendSuccess(res, slides, 'Hero slides');
};

// ─── Admin: Hero Slides ─────────────────────────────────────────────────────

export const adminListHeroSlides = async (_req: Request, res: Response) => {
  const slides = await heroSlideService.listAll();
  sendSuccess(res, slides, 'Hero slides');
};

export const adminCreateHeroSlide = async (req: Request, res: Response) => {
  const files = req.files as { [field: string]: Express.Multer.File[] } | undefined;
  const body = { ...req.body };

  if (files?.['desktopImage']?.[0]) {
    body.desktopImage = `/uploads/${files['desktopImage'][0].filename}`;
  }
  if (files?.['mobileImage']?.[0]) {
    body.mobileImage = `/uploads/${files['mobileImage'][0].filename}`;
  }

  const slide = await heroSlideService.create(body);
  sendCreated(res, slide, 'Hero slide created');
};

export const adminUpdateHeroSlide = async (req: Request, res: Response) => {
  const files = req.files as { [field: string]: Express.Multer.File[] } | undefined;
  const body = { ...req.body };

  if (files?.['desktopImage']?.[0]) {
    body.desktopImage = `/uploads/${files['desktopImage'][0].filename}`;
  }
  if (files?.['mobileImage']?.[0]) {
    body.mobileImage = `/uploads/${files['mobileImage'][0].filename}`;
  }

  const slide = await heroSlideService.update(req.params['id'] as string, body);
  sendSuccess(res, slide, 'Hero slide updated');
};

export const adminDeleteHeroSlide = async (req: Request, res: Response) => {
  await heroSlideService.delete(req.params['id'] as string);
  sendNoContent(res);
};

export const adminReorderHeroSlides = async (req: Request, res: Response) => {
  const slides = await heroSlideService.reorder(req.body.orderedIds);
  sendSuccess(res, slides, 'Hero slides reordered');
};
