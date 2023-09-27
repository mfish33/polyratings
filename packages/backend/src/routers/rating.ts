import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { t } from "@backend/trpc";
import type { PendingRating, RatingReport } from "@backend/types/schema";
import { ratingBaseParser, reportParser } from "@backend/types/schema";
import { DEPARTMENT_LIST } from "@backend/utils/const";

export const ratingsRouter = t.router({
    add: t.procedure
        .input(
            ratingBaseParser.merge(
                z.object({
                    professor: z.string().uuid(),
                    department: z.enum(DEPARTMENT_LIST),
                    courseNum: z.number().min(100).max(599),
                }),
            ),
        )
        .mutation(async ({ ctx, input }) => {
            // Input is a string subset of PendingRating
            const pendingRating: PendingRating = {
                id: crypto.randomUUID(),
                ...input,
                postDate: new Date().toString(),
                status: "Failed",
                error: null,
                analyzedScores: null,
                anonymousIdentifier: await ctx.env.anonymousIdDao.getIdentifier(),
            };

            const analyzedScores = await ctx.env.ratingAnalyzer.analyzeRaring(pendingRating);
            pendingRating.analyzedScores = analyzedScores;

            // At least 50% of people would find the text offensive in category
            const PERSPECTIVE_THRESHOLD = 0.5;

            const passedAnalysis = Object.values(analyzedScores).reduce((acc, num) => {
                if (num === undefined) {
                    throw new Error("Not all of perspective summery scores were received");
                }
                return num < PERSPECTIVE_THRESHOLD && acc;
            }, true);

            if (!passedAnalysis) {
                // Update rating in processing queue
                pendingRating.status = "Failed";
                await ctx.env.kvDao.addRatingLog(pendingRating);

                throw new TRPCError({
                    code: "PRECONDITION_FAILED",
                    message: "Rating failed sentiment analysis, please contact dev@polyratings.org for assistance",
                });
            }

            // Update rating in processing queue
            pendingRating.status = "Successful";

            const updatedProfessor = await ctx.env.kvDao.addRating(pendingRating);

            await ctx.env.kvDao.addRatingLog(pendingRating);

            return updatedProfessor;
        }),
    report: t.procedure
        .input(reportParser.merge(z.object({ ratingId: z.string().uuid(), professorId: z.string().uuid() })))
        .mutation(async ({ ctx, input }) => {
            const anonymousIdentifier = await ctx.env.anonymousIdDao.getIdentifier();
            const ratingReport: RatingReport = {
                ratingId: input.ratingId,
                professorId: input.professorId,
                reports: [
                    {
                        email: input.email,
                        reason: input.reason,
                        anonymousIdentifier,
                    },
                ],
            };

            await ctx.env.kvDao.putReport(ratingReport);
            await ctx.env.notificationDAO.notify(
                "Received A Report",
                `Rating ID: ${ratingReport.ratingId}\n` +
                    `Submitter: ${ratingReport.reports[0].anonymousIdentifier}` +
                    `Professor ID: ${ratingReport.professorId}\n` +
                    `Reason: ${ratingReport.reports[0].reason}`,
            );
        }),
});
