import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User.model';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const bodyData = await req.json();

    const newUser = await User.create({
      ...bodyData,
    });

    return NextResponse.json(newUser, { status: 201 });
  } catch (error) {
    console.error('Error in test handler:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

