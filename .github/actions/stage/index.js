// SWARM: staged build kept exactly as upstream designed it; only the
// working directory (C:\\swarm-browser) and the package glob
// (SWARM-Browser*) differ.
import * as core from '@actions/core';
import * as io from '@actions/io';
import * as exec from '@actions/exec';
import { DefaultArtifactClient } from '@actions/artifact';
import * as glob from '@actions/glob';

const BUILD_TIMEOUT_EXIT_CODE = 124;

async function run() {
    process.on('SIGINT', function() {
    })
    const finished = core.getBooleanInput('finished', {required: true});
    const from_artifact = core.getBooleanInput('from_artifact', {required: true});
    const x86 = core.getBooleanInput('x86', {required: false})
    const arm = core.getBooleanInput('arm', {required: false})
    console.log(`finished: ${finished}, artifact: ${from_artifact}`);
    if (finished) {
        core.setOutput('finished', true);
        return;
    }

    const artifact = new DefaultArtifactClient();
    const artifactName = x86 ? 'build-artifact-x86' : (arm ? 'build-artifact-arm' : 'build-artifact');

    if (from_artifact) {
        const artifactInfo = await artifact.getArtifact(artifactName);
        await artifact.downloadArtifact(artifactInfo.artifact.id, {path: 'C:\\swarm-browser\\build'});
        // SWARM: the downloaded artifact can still be held open by another
        // process (antimalware scan, the artifact client's own handle) when 7z
        // starts. Run 36373911994 build-3 died that way with a correct digest
        // ("The process cannot access the file because it is being used by
        // another process"). Retry the extraction instead of losing the run.
        let extracted = false;
        for (let attempt = 1; attempt <= 6 && !extracted; ++attempt) {
            const code = await exec.exec('7z', ['x', 'C:\\swarm-browser\\build\\artifacts.zip',
                '-oC:\\swarm-browser\\build', '-y'], {ignoreReturnCode: true});
            if (code === 0) {
                extracted = true;
            } else {
                console.error(`7z extraction attempt ${attempt} failed with exit code ${code}`);
                await new Promise(r => setTimeout(r, 30000));
            }
        }
        if (!extracted) {
            throw new Error('artifacts.zip could not be extracted after 6 attempts');
        }
        await io.rmRF('C:\\swarm-browser\\build\\artifacts.zip');
    }

    const args = ['build.py', '--ci', '-j', '2']
    if (x86)
        args.push('--x86')
    if (arm)
        args.push('--arm')
    await exec.exec('python', ['-m', 'pip', 'install', 'httplib2==0.22.0'], {
        cwd: 'C:\\swarm-browser',
        ignoreReturnCode: true
    });
    const retCode = await exec.exec('python', args, {
        cwd: 'C:\\swarm-browser',
        ignoreReturnCode: true
    });
    if (retCode === 0) {
        core.setOutput('finished', true);
        const globber = await glob.create('C:\\swarm-browser\\build\\SWARM-Browser*',
            {matchDirectories: false});
        let packageList = await globber.glob();
        const finalArtifactName = x86 ? 'chromium-x86' : (arm ? 'chromium-arm' : 'chromium');
        for (let i = 0; i < 5; ++i) {
            try {
                await artifact.deleteArtifact(finalArtifactName);
            } catch (e) {
                // ignored
            }
            try {
                await artifact.uploadArtifact(finalArtifactName, packageList,
                    'C:\\swarm-browser\\build', {retentionDays: 4, compressionLevel: 0});
                break;
            } catch (e) {
                console.error(`Upload artifact failed: ${e}`);
                // Wait 10 seconds between the attempts
                await new Promise(r => setTimeout(r, 10000));
            }
        }
    } else if (retCode === BUILD_TIMEOUT_EXIT_CODE) {
        await new Promise(r => setTimeout(r, 5000));
        await exec.exec('7z', ['a', '-tzip', 'C:\\swarm-browser\\artifacts.zip',
            'C:\\swarm-browser\\build\\src', '-mx=3', '-mtc=on'], {ignoreReturnCode: true});
        for (let i = 0; i < 5; ++i) {
            try {
                await artifact.deleteArtifact(artifactName);
            } catch (e) {
                // ignored
            }
            try {
                await artifact.uploadArtifact(artifactName, ['C:\\swarm-browser\\artifacts.zip'],
                    'C:\\swarm-browser', {retentionDays: 4, compressionLevel: 0});
                break;
            } catch (e) {
                console.error(`Upload artifact failed: ${e}`);
                // Wait 10 seconds between the attempts
                await new Promise(r => setTimeout(r, 10000));
            }
        }
        core.setOutput('finished', false);
    } else {
        throw new Error(`Build failed with exit code ${retCode}`);
    }
}

run().catch(err => core.setFailed(err.message));
