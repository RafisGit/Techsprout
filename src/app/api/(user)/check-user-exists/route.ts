import { errorResponse, successResponse } from '@/lib/apiResponse';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User.model';
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const username = searchParams.get('username')?.trim() || '';
    const email = searchParams.get('email')?.trim() || '';

    if (!username && !email) {
      return errorResponse('Username or email parameter is required', 400);
    }

    await connectDB();

    const conditions: Array<{ username?: string; email?: string }> = [];
    if (username) conditions.push({ username });
    if (email) conditions.push({ email });

    const exists = await User.exists({
      $or: conditions,
    });

    if (exists) {
      return successResponse(`${email ? 'Email' : 'Username'} already in use`, exists);
    }

    return errorResponse("User doesn't exists", 400);
  } catch (error) {
    console.error('Error in check-user-exists handler:', error);
    return errorResponse(
      'There was a problem in the server while processing the request',
      500,
      'SERVER_ERROR'
    );
  }
}

