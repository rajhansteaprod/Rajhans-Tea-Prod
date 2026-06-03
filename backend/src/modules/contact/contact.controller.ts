import { Request, Response } from 'express';
import { contactService, CreateContactDto } from './services/contact.service';
import { ApiError } from '../../utils/api-error';

export const submitContact = async (req: Request, res: Response) => {
  try {
    const data: CreateContactDto = req.body;

    const result = await contactService.submitContact(data);

    res.status(201).json({
      success: true,
      message: 'Contact form submitted successfully',
      referenceId: result.referenceId,
      data: {
        referenceId: result.referenceId,
      },
    });
  } catch (error) {
    throw new ApiError(500, 'Failed to submit contact form');
  }
};

export const getSubmissions = async (req: Request, res: Response) => {
  try {
    const { reason, status, page = 1, limit = 10 } = req.query;
    const reasonStr = typeof reason === 'string' ? reason : undefined;
    const statusStr = typeof status === 'string' ? status : undefined;
    const pageNum = typeof page === 'string' ? parseInt(page) : 1;
    const limitNum = typeof limit === 'string' ? parseInt(limit) : 10;

    const result = await contactService.getAllSubmissions({
      reasonToContact: reasonStr as any,
      status: statusStr,
      page: pageNum,
      limit: limitNum,
    });

    res.status(200).json({
      success: true,
      data: result.submissions,
      meta: {
        total: result.total,
        page: result.page,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    throw new ApiError(500, 'Failed to fetch submissions');
  }
};

export const getSubmissionById = async (req: Request, res: Response) => {
  try {
    const { referenceId } = req.params;

    const submission = await contactService.getSubmissionById(referenceId as string);

    if (!submission) {
      throw new ApiError(404, 'Submission not found');
    }

    res.status(200).json({
      success: true,
      data: submission,
    });
  } catch (error) {
    throw error;
  }
};

export const updateSubmission = async (req: Request, res: Response) => {
  try {
    const { referenceId } = req.params;
    const { status, internalNotes } = req.body;

    const updated = await contactService.updateSubmissionStatus(referenceId as string, status, internalNotes);

    if (!updated) {
      throw new ApiError(404, 'Submission not found');
    }

    res.status(200).json({
      success: true,
      message: 'Submission updated successfully',
      data: updated,
    });
  } catch (error) {
    throw error;
  }
};

export const deleteSubmission = async (req: Request, res: Response) => {
  try {
    const { referenceId } = req.params;

    const deleted = await contactService.deleteSubmission(referenceId as string);

    if (!deleted) {
      throw new ApiError(404, 'Submission not found');
    }

    res.status(200).json({
      success: true,
      message: 'Submission deleted successfully',
    });
  } catch (error) {
    throw error;
  }
};

export const getMetrics = async (_req: Request, res: Response) => {
  try {
    const metrics = await contactService.getMetrics();

    res.status(200).json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    throw new ApiError(500, 'Failed to fetch metrics');
  }
};
