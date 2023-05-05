import { NextApiRequest, NextApiResponse } from "next";
import { UploadPartCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Token } from "@/models/Token";
import dbConnect from "@/lib/connect-db";
import { bucketClient } from "@/utils/storage";

const BUCKET_NAME = process.env.GCP_RAW_BUCKET!;

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method === "POST") {
        await dbConnect();
        const token = req.headers["token"] as string;
        const tokens = await Token.find({ charges: { $gte: 1 } });
        if (!tokens.map((i) => i.token).includes(token)) {
            res.status(403).json({ message: "Acess Denied" });
            return;
        }
        const { Key, UploadId, parts } = req.body;
        const promises = [];

        for (let index = 0; index < parts; index++) {
            const command = new UploadPartCommand({
                Bucket: BUCKET_NAME,
                Key,
                UploadId,
                PartNumber: index + 1,
            });
            promises.push(getSignedUrl(bucketClient, command));
        }

        const signedUrls = await Promise.all(promises);
        const partSignedUrlList = signedUrls.map((signedUrl, index) => {
            return {
                signedUrl: signedUrl,
                PartNumber: index + 1,
            };
        });

        res.json({
            parts: partSignedUrlList,
        });
    } else {
        res.status(404).json({
            msg: "This method doesn't exist on this route",
        });
    }
}
